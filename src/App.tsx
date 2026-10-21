import React, { useState } from 'react';
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  Search,
  Theme,
  Button,
  Tile,
} from '@carbon/react';
import { Asleep, Light } from '@carbon/icons-react';
import { NAV_ITEMS, navIdOf, type ConsolePage } from './console/nav';
import { DashboardPage } from './console/pages/DashboardPage';
import { DiagramPage } from './console/pages/DiagramPage';
import { AssetsPage, ProjectDetailPage, ProjectsPage, SyncPage } from './console/pages/ListPages';
import { useApi } from './console/api';
import { ApiGate, PageHeader } from './console/common';
import { ComponentsPage } from './console/pages/ComponentsPage';
import { ImportPage } from './console/pages/ImportPage';

/**
 * onprem-atlas 콘솔 — IBM Cloud 콘솔 패턴(어두운 상단바 + 본문을 밀어내는 좌측 내비 + 위젯 대시보드).
 * 데이터는 키트 API(`onprem-atlas serve`)에서 읽는다. 고정 SideNav는 본문을 가려 쓰지 않는다(docs/LESSONS.md).
 */
export const App: React.FC = () => {
  const [page, setPage] = useState<ConsolePage>({ id: 'dashboard' });
  const [navOpen, setNavOpen] = useState(true);
  const [theme, setTheme] = useState<'g10' | 'g100'>('g10');
  const [headerQuery, setHeaderQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [diagramDirty, setDiagramDirty] = useState(false);
  const workspace = useApi<{ has_assets: boolean }>(`/api/workspace?revision=${revision}`);

  const go = (next: ConsolePage) => {
    if (diagramDirty && !window.confirm('저장하지 않은 구성도 편집을 버리고 이동할까요?')) return;
    setDiagramDirty(false);
    setPage(next);
    document.getElementById('main-content')?.scrollIntoView?.({ block: 'start' });
  };

  let groupShown: string | undefined;
  const activeNav = navIdOf(page);

  return (
    <Theme theme={theme} className="atlas-root">
      <Theme theme="g100">
        <Header aria-label="온프렘 아틀라스">
          <HeaderMenuButton aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'} isActive={navOpen} isCollapsible onClick={() => setNavOpen((v) => !v)} />
          <HeaderName href="#" prefix="" onClick={(e: React.MouseEvent) => { e.preventDefault(); go({ id: 'dashboard' }); }}>
            온프렘 아틀라스
          </HeaderName>
          <form
            className="atlas-header-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              go({ id: 'assets', q: headerQuery });
            }}
          >
            <Search size="sm" labelText="자산 검색" placeholder="호스트명, IP, 시스템명으로 자산 검색" value={headerQuery} onChange={(e) => setHeaderQuery(e.target.value)} />
          </form>
          <HeaderGlobalBar>
            <HeaderGlobalAction
              aria-label={theme === 'g10' ? '어두운 테마' : '밝은 테마'}
              tooltipAlignment="end"
              onClick={() => setTheme((t) => (t === 'g10' ? 'g100' : 'g10'))}
            >
              {theme === 'g10' ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
      </Theme>

      <div className={`atlas-shell${navOpen ? '' : ' atlas-shell--collapsed'}`}>
        {navOpen && (
          <nav className="atlas-nav" aria-label="콘솔 메뉴">
            <ul>
              {NAV_ITEMS.map((item) => {
                const heading = item.group && item.group !== groupShown ? item.group : undefined;
                groupShown = item.group ?? groupShown;
                return (
                  <React.Fragment key={item.id}>
                    {heading && <li className="atlas-nav__group">{heading}</li>}
                    <li>
                      <button
                        type="button"
                        className={`atlas-nav__item${activeNav === item.id ? ' atlas-nav__item--active' : ''}`}
                        aria-current={activeNav === item.id ? 'page' : undefined}
                        onClick={() => go({ id: item.id } as ConsolePage)}
                      >
                        {item.label}
                      </button>
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </nav>
        )}
        <main className="atlas-main" id="main-content">
          <ApiGate state={workspace}>
          {(w) => page.id === 'import' ? <ImportPage go={go} onImported={() => setRevision((n) => n + 1)} /> : w.has_assets ? <>
          {page.id === 'dashboard' && <DashboardPage go={go} />}
          {page.id === 'projects' && <ProjectsPage go={go} />}
          {page.id === 'project' && <ProjectDetailPage key={page.code} go={go} code={page.code} />}
          {page.id === 'diagram' && <DiagramPage key={page.project ?? ''} go={go} project={page.project} onDirty={setDiagramDirty} />}
          {page.id === 'assets' && <AssetsPage key={page.q ?? ''} go={go} initialQuery={page.q} />}
          {page.id === 'components' && <ComponentsPage go={go} />}
          {page.id === 'sync' && <SyncPage go={go} />}
          </> : <>
            <PageHeader title="IDC 자산 관리" subtitle="ESM 자산을 기준으로 IDC와 업무 시스템 구성도를 관리합니다." />
            <Tile className="atlas-widget">
              <h2 className="atlas-widget__title">등록된 자산이 없습니다</h2>
              <p>ESM에서 내려받은 서버·장비 Excel을 등록하면 자산 목록과 구성도를 확인할 수 있습니다.</p>
              <Button className="atlas-diff-summary" onClick={() => go({ id: 'import' })}>첫 Excel 등록</Button>
            </Tile>
          </>}
          </ApiGate>
        </main>
      </div>
    </Theme>
  );
};
