import { describe, expect, it } from 'vitest';
import { importFromNetBox, overlayVendorConfig, type NetBoxExport } from '../../adapters/netboxAdapter';
import { VENDOR_SAMPLE_CONFIGS, parseVendorConfigText } from '../../adapters/vendorConfigParser';

const NETBOX: NetBoxExport = {
  devices: [
    { id: 1, name: 'fw-extranet-pa3260', role: { id: 1, slug: 'firewall' }, device_type: { model: 'PA-3260', manufacturer: { id: 1, slug: 'palo-alto' } }, custom_fields: { security_zone: '대외경계망' } },
    { id: 2, name: 'was-prod-01', role: { id: 2, slug: 'server' }, platform: { id: 1, slug: 'rhel-9' }, location: { id: 1, name: '업무망' } },
    { id: 3, name: 'ups-01', role: { id: 3, slug: 'pdu' } },
    { id: 4, name: null },
  ],
  interfaces: [
    { id: 11, device: { id: 1 }, name: 'ethernet1/1' },
    { id: 12, device: { id: 1 }, name: 'mgmt', mgmt_only: true },
    { id: 21, device: { id: 2 }, name: 'eth0', untagged_vlan: { vid: 20 } },
  ],
  ip_addresses: [
    { id: 101, address: '10.254.3.10/24', assigned_object_type: 'dcim.interface', assigned_object_id: 11 },
    { id: 102, address: '10.10.20.15/24', assigned_object_type: 'dcim.interface', assigned_object_id: 21 },
  ],
  cables: [
    { id: 201, a_terminations: [{ object_type: 'dcim.interface', object_id: 11 }], b_terminations: [{ object_type: 'dcim.interface', object_id: 21 }] },
    { id: 202, a_terminations: [{ object_type: 'dcim.frontport', object_id: 9 }], b_terminations: [{ object_type: 'dcim.interface', object_id: 12 }] },
  ],
};

describe('NetBox 어댑터', () => {
  it('장비·인터페이스·케이블·워크로드를 엔진 스냅샷으로 변환한다', () => {
    const { document, warnings } = importFromNetBox(NETBOX);
    const sem = document.semantic;
    expect(sem.devices.map((d) => [d.id, d.role, d.vendor])).toEqual([
      ['fw-extranet-pa3260', 'firewall', 'paloalto'],
      ['was-prod-01', 'host', 'linux'],
      ['ups-01', 'host', 'generic'],
    ]);
    expect(sem.devices[0]?.securityZone).toBe('대외경계망');
    expect(sem.devices[1]?.securityZone).toBe('업무망');
    expect(sem.interfaces.find((i) => i.name === 'ethernet1/1')?.id).toBe('fw-extranet-pa3260-ethernet11');
    expect(sem.links).toHaveLength(1);
    expect(sem.bindings['wl-was-prod-01']?.ip).toBe('10.10.20.15');
    expect(sem.devices.every((d) => !d.completeness.routingTableComplete)).toBe(true);
    expect(warnings).toHaveLength(3); // 이름 없는 장비, 매핑 없는 role, 패치패널 케이블
  });

  it('벤더 config를 덧씌워도 NetBox 메타데이터와 케이블 링크를 보존한다', () => {
    const base = importFromNetBox(NETBOX).document;
    const parsed = parseVendorConfigText(VENDOR_SAMPLE_CONFIGS.paloalto.sampleText);
    const { document, warnings } = overlayVendorConfig(base, parsed);
    const fw = document.semantic.devices.find((d) => d.id === 'fw-extranet-pa3260');
    expect(fw?.modelName).toBe('PA-3260');
    expect(fw?.securityZone).toBe('대외경계망');
    expect(fw?.completeness.policyTableComplete).toBe(true);
    expect(document.semantic.links).toHaveLength(1);
    expect(document.semantic.policies.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('NetBox 자산에 없습니다'))).toBe(false);
  });
});
