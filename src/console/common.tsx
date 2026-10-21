import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  InlineLoading,
  InlineNotification,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react';
import type { ApiState } from './api';

export const PageHeader: React.FC<{
  crumbs?: Array<{ label: string; onClick?: () => void }>;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ crumbs, title, subtitle, actions }) => (
  <header className="atlas-page-header">
    {crumbs && crumbs.length > 0 && (
      <Breadcrumb noTrailingSlash>
        {crumbs.map((c) => (
          <BreadcrumbItem key={c.label} href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); c.onClick?.(); }}>
            {c.label}
          </BreadcrumbItem>
        ))}
      </Breadcrumb>
    )}
    <div className="atlas-page-header__row">
      <div>
        <h1 className="atlas-page-title">{title}</h1>
        {subtitle && <p className="atlas-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="atlas-page-actions">{actions}</div>}
    </div>
  </header>
);

export function ApiGate<T>({ state, children }: { state: ApiState<T>; children: (data: T) => React.ReactNode }) {
  if (state.error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="데이터를 불러오지 못했습니다"
        subtitle={`${state.error} — 잠시 후 다시 시도하거나 운영 담당자에게 확인하세요.`}
      />
    );
  }
  if (!state.data) return <InlineLoading description="불러오는 중…" />;
  return <>{children(state.data)}</>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

export function SimpleTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  onRowClick,
  toolbar,
  size = 'md',
}: {
  title?: string;
  description?: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  return (
    <TableContainer title={title} description={description}>
      {toolbar}
      <Table size={size} useZebraStyles={false}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableHeader key={c.key}>{c.header}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length}>표시할 항목이 없습니다.</TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={onRowClick ? 'atlas-clickable-row' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <TableCell key={c.key}>{c.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export const Pager: React.FC<{ page: number; pageSize: number; total: number; onChange: (page: number, pageSize: number) => void }> = ({
  page,
  pageSize,
  total,
  onChange,
}) => (
  <Pagination
    page={page}
    pageSize={pageSize}
    pageSizes={[20, 50, 100]}
    totalItems={total}
    itemsPerPageText="페이지당"
    pageRangeText={(_: number, n: number) => `/ ${n}쪽`}
    itemRangeText={(min: number, max: number, t: number) => `${min}–${max} / 총 ${t.toLocaleString('ko-KR')}건`}
    onChange={({ page: p, pageSize: s }: { page: number; pageSize: number }) => onChange(p, s)}
  />
);
