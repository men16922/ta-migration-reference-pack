import React, { useMemo } from 'react';
import {
  Button,
  ButtonSet,
  CodeSnippet,
  Column,
  Grid,
  InlineNotification,
  Stack,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react';
import {
  CheckmarkFilled,
  DocumentDownload,
  ErrorFilled,
  FlashFilled,
  Reset,
  WarningFilled,
} from '@carbon/icons-react';
import { analyzeIntent } from '../core/analyzer';
import type { NetworkSnapshot } from '../core/types';
import { ONPREM_ASSURANCE_MATRIX_INTENTS } from '../fixtures/onPremEnterpriseTopology';

interface PreChangeSimulatorViewProps {
  baselineSnapshot: NetworkSnapshot;
  currentSnapshot: NetworkSnapshot;
  changeHistory: string[];
  onSimulatePresetChange: (
    presetKind: 'OPEN_WAS_DB' | 'BREAK_CORE_ROUTE' | 'RESET_BASELINE',
  ) => void;
}

export const PreChangeSimulatorView: React.FC<PreChangeSimulatorViewProps> = ({
  baselineSnapshot,
  currentSnapshot,
  changeHistory,
  onSimulatePresetChange,
}) => {
  const rows = useMemo(() => {
    return ONPREM_ASSURANCE_MATRIX_INTENTS.map((intent) => {
      const baseRes = analyzeIntent(baselineSnapshot, intent);
      const currRes = analyzeIntent(currentSnapshot, intent);

      let deltaType:
        | 'UNCHANGED_PASS'
        | 'FIXED_NOW_PASS'
        | 'REGRESSION_BROKEN'
        | 'UNCHANGED_FAIL' = 'UNCHANGED_PASS';

      if (baseRes.intentVerdict === 'fail' && currRes.intentVerdict === 'pass') {
        deltaType = 'FIXED_NOW_PASS';
      } else if (baseRes.intentVerdict === 'pass' && currRes.intentVerdict === 'fail') {
        deltaType = 'REGRESSION_BROKEN';
      } else if (currRes.intentVerdict === 'fail') {
        deltaType = 'UNCHANGED_FAIL';
      }

      return {
        intent,
        baseRes,
        currRes,
        deltaType,
      };
    });
  }, [baselineSnapshot, currentSnapshot]);

  const regressionsCount = rows.filter((r) => r.deltaType === 'REGRESSION_BROKEN').length;
  const fixedCount = rows.filter((r) => r.deltaType === 'FIXED_NOW_PASS').length;
  const passCount = rows.filter((r) => r.currRes.intentVerdict === 'pass').length;

  const mopMarkdown = useMemo(() => {
    return [
      `# [온프레미스 야간 작업 사전 검증 결과서 (MOP)]`,
      `- **검증 일시**: 2026-10-21`,
      `- **전사 핵심 통신 매트릭스 통과율**: ${passCount} / ${rows.length}건`,
      `- **신규 개통 완료 항목**: ${fixedCount}건`,
      `- **기존 업무 장애 유발(Regression) 건수**: ${regressionsCount}건`,
      `- **최종 작업 승인 판정**: ${
        regressionsCount > 0
          ? '작업 반려 (CRITICAL REGRESSION DETECTED — 기존 핵심 서비스 단절 위험)'
          : '작업 승인 가능 (기존 핵심 서비스 영향도 0건 확인)'
      }`,
      ``,
      `## 1. 디지털 트윈 변경 이력 (Staged Changes)`,
      ...(changeHistory.length === 0
        ? ['- 변경 이력 없음 (운영 기준점 Baseline 상태)']
        : changeHistory.map((c, idx) => `${idx + 1}. ${c}`)),
      ``,
      `## 2. 전사 핵심 업무 영향도 비교 매트릭스`,
      ...rows.map(
        (r) =>
          `- **[${r.intent.categoryKo}] ${r.intent.name}**: 작업 전(${r.baseRes.networkOutcome.toUpperCase()} / ${r.baseRes.intentVerdict.toUpperCase()}) ➔ 작업 후(${r.currRes.networkOutcome.toUpperCase()} / ${r.currRes.intentVerdict.toUpperCase()}) [${r.deltaType}]`,
      ),
    ].join('\n');
  }, [changeHistory, fixedCount, passCount, regressionsCount, rows]);

  const handleDownloadMop = () => {
    const blob = new Blob([mopMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `온프레미스_야간작업_사전검증_MOP.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap={6}>
      {/* 1. 상단 야간 작업 시뮬레이션 시나리오 선택 타일 */}
      <Tile>
        <Stack gap={5}>
          <div>
            <p className="cds--label">Pre-Change Differential Assurance &amp; Method of Procedure</p>
            <h3>야간 작업 사전 시뮬레이터 &amp; 전사 핵심 업무 영향도 검증 (Pre-Change Assurance)</h3>
            <p className="cds--helper-text">
              실제 방화벽이나 코어 스위치에 야간 작업을 투입하기 전, 변경 사항이 사내 필수 업무(대외웹, WAS-DB, 통합 AD/DNS, 망분리 보안 가드레일)에 미칠 영향을 작업 전(Baseline)과 작업 후(After Change)로 대조 검증합니다.
            </p>
          </div>
          <ButtonSet>
            <Button
              kind="primary"
              size="md"
              renderIcon={FlashFilled}
              onClick={() => onSimulatePresetChange('OPEN_WAS_DB')}
            >
              시나리오 1: 시큐아이 BLUEMAX WAS➔DB(1521) 개통 작업 시뮬레이션
            </Button>
            <Button
              kind="danger"
              size="md"
              renderIcon={WarningFilled}
              onClick={() => onSimulatePresetChange('BREAK_CORE_ROUTE')}
            >
              시나리오 2: 코어 스위치 라우팅 오작업(장애 유발) 탐지 테스트
            </Button>
            <Button
              kind="secondary"
              size="md"
              renderIcon={Reset}
              onClick={() => onSimulatePresetChange('RESET_BASELINE')}
            >
              운영 기준점(Baseline)으로 초기화
            </Button>
          </ButtonSet>
        </Stack>
      </Tile>

      {/* 2. 작업 승인 여부 요약 KPI (Carbon 16-column Grid) */}
      <Grid fullWidth>
        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">야간 작업 안전성 판정</p>
              <h2>{regressionsCount > 0 ? '작업 반려 (장애위험)' : '작업 승인 가능'}</h2>
              <Tag type={regressionsCount > 0 ? 'red' : 'green'}>
                {regressionsCount > 0
                  ? `Regression ${regressionsCount}건 감지`
                  : 'Side-Effect 0건'}
              </Tag>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">전사 핵심 통신 매트릭스 통과율</p>
              <h2>
                {passCount} / {rows.length}건
              </h2>
              <p className="cds--helper-text">양방향 L3 라우팅 + 다중 방화벽 + 보안 가드레일 기준</p>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">작업 후 신규 개통 완료 (Fixed)</p>
              <h2>+{fixedCount}건</h2>
              <p className="cds--helper-text">차단 상태에서 정상 개통(PASS)으로 전환된 업무 플로우</p>
            </Stack>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--label">작업 유발 장애 (Regression)</p>
              <h2>{regressionsCount}건</h2>
              <p className="cds--helper-text">작업 전 정상(PASS)이었으나 작업 후 끊긴 업무 플로우</p>
            </Stack>
          </Tile>
        </Column>
      </Grid>

      {regressionsCount > 0 && (
        <InlineNotification
          kind="error"
          title="야간 작업 반려 경고 (Critical Service Regression Detected)"
          subtitle={`적용된 변경 사항으로 인해 기존에 정상 작동하던 사내 핵심 업무 ${regressionsCount}건에서 경로 단절이 발생했습니다. 아래 비교표를 확인하십시오.`}
          lowContrast
          hideCloseButton
        />
      )}

      {/* 3. 전사 핵심 통신 영향도 비교 테이블 */}
      <Tile>
        <TableContainer
          title="작업 전(Baseline) vs 작업 후(Staged Digital Twin) 전사 핵심 업무 영향도 비교표"
          description="Forward Enterprise 및 IP Fabric의 Intent Assurance Matrix 방식과 동일하게 모든 핵심 경로의 양방향 도달성과 보안 통제 준수 여부를 자동 대조합니다."
        >
          <Table size="md" useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>업무 분류 / 중요도</TableHeader>
                <TableHeader>검증 대상 업무 플로우</TableHeader>
                <TableHeader>기대 정책</TableHeader>
                <TableHeader>작업 전 (Baseline)</TableHeader>
                <TableHeader>작업 후 (After Change)</TableHeader>
                <TableHeader>영향도 판정 (Delta)</TableHeader>
                <TableHeader>상세 진단 근거</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ intent, baseRes, currRes, deltaType }) => (
                <TableRow key={intent.id}>
                  <TableCell>
                    <div>
                      <strong>{intent.categoryKo}</strong>
                    </div>
                    <Tag
                      type={
                        intent.criticality === 'security-guard'
                          ? 'purple'
                          : intent.criticality === 'critical'
                            ? 'red'
                            : 'blue'
                      }
                      size="sm"
                    >
                      {intent.criticality === 'security-guard'
                        ? 'ISMS-P 보안통제'
                        : intent.criticality?.toUpperCase()}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <strong>{intent.name}</strong>
                    <div className="cds--helper-text">{intent.descriptionKo}</div>
                  </TableCell>
                  <TableCell>
                    <Tag
                      type={intent.expectedNetworkOutcome === 'allow' ? 'green' : 'magenta'}
                      size="sm"
                    >
                      {intent.expectedNetworkOutcome === 'allow'
                        ? '양방향 허용 필수'
                        : '원천 차단 필수'}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <Tag
                      type={baseRes.intentVerdict === 'pass' ? 'green' : 'warm-gray'}
                      size="sm"
                    >
                      {baseRes.networkOutcome.toUpperCase()} ({baseRes.intentVerdict.toUpperCase()})
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <Tag type={currRes.intentVerdict === 'pass' ? 'green' : 'red'} size="sm">
                      {currRes.networkOutcome.toUpperCase()} ({currRes.intentVerdict.toUpperCase()})
                    </Tag>
                  </TableCell>
                  <TableCell>
                    {deltaType === 'FIXED_NOW_PASS' && (
                      <Tag type="blue" renderIcon={CheckmarkFilled}>
                        신규 개통 완료 (FIXED)
                      </Tag>
                    )}
                    {deltaType === 'REGRESSION_BROKEN' && (
                      <Tag type="red" renderIcon={ErrorFilled}>
                        장애 유발 탐지 (REGRESSION!)
                      </Tag>
                    )}
                    {deltaType === 'UNCHANGED_PASS' && (
                      <Tag type="green" renderIcon={CheckmarkFilled}>
                        정상 유지 (OK)
                      </Tag>
                    )}
                    {deltaType === 'UNCHANGED_FAIL' && (
                      <Tag type="warm-gray">미개통 상태 (정책신청 전)</Tag>
                    )}
                  </TableCell>
                  <TableCell>
                    <code>{currRes.forwardTrace.finalReasonCode}</code>:{' '}
                    {currRes.forwardTrace.finalReason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Tile>

      {/* 4. 야간 작업 계획서 (MOP) 출력 */}
      <Tile>
        <Stack gap={4}>
          <Grid fullWidth>
            <Column lg={12} md={6} sm={4}>
              <h4>야간 작업 사전 검증 보고서 (Method of Procedure — 결재 첨부용)</h4>
              <p className="cds--helper-text">
                변경감리위원회(CAB) 및 야간 작업 승인 결재에 즉시 첨부할 수 있는 사전 영향도 검증 리포트입니다.
              </p>
            </Column>
            <Column lg={4} md={2} sm={4}>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={DocumentDownload}
                onClick={handleDownloadMop}
              >
                야간 작업 검증서(MOP.md) 다운로드
              </Button>
            </Column>
          </Grid>
          <CodeSnippet type="multi" feedback="보고서 복사됨">
            {mopMarkdown}
          </CodeSnippet>
        </Stack>
      </Tile>
    </Stack>
  );
};
