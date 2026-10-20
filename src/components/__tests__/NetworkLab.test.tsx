import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NetworkLab } from '../NetworkLab';

describe('네트워크 분석(실험) — NetworkLab', () => {
  it('renders pure Carbon UI Shell, diagnoses multi-firewall path (SR-2026-0412), and auto-applies remediation to open the path', () => {
    render(<NetworkLab />);

    expect(screen.getByText(/1\. 통신 경로 분석기/i)).toBeInTheDocument();

    // Initially SR-2026-0412 (WAS -> DB 1521) is BLOCKED at SECUI BLUEMAX
    expect(screen.getByText(/경유 구간 차단 탐지/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /권고 정책을 디지털 트윈에 즉시 반영하여 개통 확인/i,
      }),
    ).toBeInTheDocument();

    // Click auto-apply remediation button
    fireEvent.click(
      screen.getByRole('button', {
        name: /권고 정책을 디지털 트윈에 즉시 반영하여 개통 확인/i,
      }),
    );

    // Path immediately becomes REACHABLE
    expect(screen.getByText(/양방향 통신 개통 완료 \(REACHABLE\)/i)).toBeInTheDocument();
  });

  it('switches to Firewall Audit tab via Carbon UI Shell, displays REA findings, and cleans up offending rules', () => {
    render(<NetworkLab />);

    const auditNavLinks = screen.getAllByText(/2\. 방화벽 정책 감사/i);
    fireEvent.click(auditNavLinks[0]!);

    expect(screen.getByText(/ISMS-P 방화벽 정책 적합도 점수/i)).toBeInTheDocument();
    expect(screen.getAllByText(/가려진 죽은 정책 \(Shadowed Rule\)/i).length).toBeGreaterThan(0);

    // Click bulk cleanup button
    const bulkBtn = screen.getByRole('button', {
      name: /조회된 비정상·위험 정책 일괄 정리/i,
    });
    fireEvent.click(bulkBtn);

    expect(
      screen.getByText(/모든 방화벽 정책이 ISMS-P 및 사내 보안 기준을 충족합니다/i),
    ).toBeInTheDocument();
  });

  it('switches to Multi-Vendor Config Builder tab via Carbon UI Shell and merges a parsed vendor config into the Digital Twin', () => {
    render(<NetworkLab />);

    const builderNavLinks = screen.getAllByText(/3\. 방화벽 규칙·라우팅 추가/i);
    fireEvent.click(builderNavLinks[0]!);

    expect(
      screen.getByText(/실시간 정규화 AST 파싱 결과 미리보기/i),
    ).toBeInTheDocument();

    const mergeBtn = screen.getByRole('button', {
      name: /파싱된 장비\(fw-extranet-pa3260\)를 디지털 트윈 토폴로지에 즉시 병합/i,
    });
    fireEvent.click(mergeBtn);

    expect(
      screen.getByText(/디지털 트윈 토폴로지에 병합되었습니다/i),
    ).toBeInTheDocument();
  });

  it('switches to Pre-Change Night-Work Simulator tab via Carbon UI Shell and detects core route regression', () => {
    render(<NetworkLab />);

    const mopNavLinks = screen.getAllByText(/4\. 작업 전 변경 영향도/i);
    fireEvent.click(mopNavLinks[0]!);

    const breakRouteBtn = screen.getByRole('button', {
      name: /시나리오 2: 코어 스위치 라우팅 오작업\(장애 유발\) 탐지 테스트/i,
    });
    fireEvent.click(breakRouteBtn);

    expect(screen.getByText(/작업 반려 \(장애위험\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/장애 유발 탐지 \(REGRESSION!\)/i).length).toBeGreaterThan(0);
  });
});
