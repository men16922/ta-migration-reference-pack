export type ConsolePage =
  | { id: 'dashboard' }
  | { id: 'projects' }
  | { id: 'project'; code: string }
  | { id: 'diagram'; project?: string }
  | { id: 'assets'; q?: string }
  | { id: 'review'; rule?: string }
  | { id: 'sync' }
  | { id: 'network-lab' };

export const NAV_ITEMS: Array<{ id: ConsolePage['id']; label: string; group?: string }> = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'projects', label: '프로젝트', group: '자산' },
  { id: 'diagram', label: '구성도', group: '자산' },
  { id: 'assets', label: '자산 목록', group: '자산' },
  { id: 'review', label: '준비도 검토', group: '이관 준비' },
  { id: 'sync', label: '동기화 이력', group: '이관 준비' },
  { id: 'network-lab', label: '네트워크 분석(실험)', group: '도구' },
];

/** 상세 페이지는 상위 메뉴를 선택 상태로 보여준다. */
export const navIdOf = (page: ConsolePage): ConsolePage['id'] => (page.id === 'project' ? 'projects' : page.id);
