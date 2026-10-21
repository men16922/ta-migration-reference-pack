export type ConsolePage =
  | { id: 'dashboard' }
  | { id: 'import' }
  | { id: 'projects' }
  | { id: 'project'; code: string }
  | { id: 'diagram'; project?: string }
  | { id: 'assets'; q?: string }
  | { id: 'components' }
  | { id: 'sync' };

export const NAV_ITEMS: Array<{ id: ConsolePage['id']; label: string; group?: string }> = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'import', label: 'Excel 등록' },
  { id: 'diagram', label: 'IDC 구성도' },
  { id: 'projects', label: '업무 시스템', group: '자산' },
  { id: 'assets', label: '자산 목록', group: '자산' },
  { id: 'components', label: 'WEB · WAS · DB', group: '자산' },
  { id: 'sync', label: '등록·변경 이력' },
];

/** 상세 페이지는 상위 메뉴를 선택 상태로 보여준다. */
export const navIdOf = (page: ConsolePage): ConsolePage['id'] => (page.id === 'project' ? 'projects' : page.id);
