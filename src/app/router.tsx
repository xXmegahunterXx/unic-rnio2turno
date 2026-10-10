/**
 * Rotas. BrowserRouter em produção; HashRouter no build demo (preview estático com caminhos relativos).
 * Cada página vive em seu próprio arquivo e é carregada sob demanda (code splitting).
 */
import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, createHashRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';

function page(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(loader);
  return (
    <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
      <C />
    </Suspense>
  );
}

const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: page(() => import('./pages/Home')) },
      { path: '/teste', element: page(() => import('./pages/teste/TestePage')) },
      { path: '/teste/resultado', element: page(() => import('./pages/teste/ResultadoPage')) },
      { path: '/duelo/:codigo', element: page(() => import('./pages/teste/DueloPage')) },
      { path: '/apuracao', element: page(() => import('./pages/apuracao/NacionalPage')) },
      { path: '/apuracao/consulta', element: page(() => import('./pages/apuracao/ConsultaPage')) },
      { path: '/governadores', element: page(() => import('./pages/apuracao/GovernadoresPage')) },
      { path: '/apuracao/:uf', element: page(() => import('./pages/apuracao/UfPage')) },
      { path: '/apuracao/:uf/:cod', element: page(() => import('./pages/apuracao/MunicipioPage')) },
      { path: '/apuracao/:uf/:cod/:zona/:secao', element: page(() => import('./pages/apuracao/SecaoPage')) },
      { path: '/senado', element: page(() => import('./pages/cargos/SenadoPage')) },
      { path: '/camara', element: page(() => import('./pages/cargos/CamaraPage')) },
      { path: '/assembleias', element: page(() => import('./pages/cargos/AssembleiaPage')) },
      { path: '/assembleias/:uf', element: page(() => import('./pages/cargos/AssembleiaPage')) },
      { path: '/candidato/:sqcand', element: page(() => import('./pages/cargos/CandidatoPage')) },
      { path: '/curiosidades', element: page(() => import('./pages/curiosidades/CuriosidadesPage')) },
      { path: '/cenarios', element: page(() => import('./pages/cenarios/CenariosPage')) },
      { path: '/metodologia', element: page(() => import('./pages/static/MetodologiaPage')) },
      { path: '/privacidade', element: page(() => import('./pages/static/PrivacidadePage')) },
      { path: '/sobre', element: page(() => import('./pages/static/SobrePage')) },
      { path: '/kit', element: page(() => import('./pages/dev/KitPage')) },
      { path: '/kit/viz', element: page(() => import('./pages/dev/KitVizPage')) },
      { path: '*', element: page(() => import('./pages/static/NotFoundPage')) },
    ],
  },
  // Admin fica fora do AppShell público (layout próprio).
  { path: '/admin', element: page(() => import('./pages/admin/AdminPage')) },
  // Modo TV: tela cheia própria (fora do AppShell), para transmissão.
  { path: '/tv', element: page(() => import('./pages/tv/TvPage')) },
  // Widgets para incorporar (iframe em sites de terceiros): sem AppShell.
  { path: '/embed/:tipo', element: page(() => import('./pages/embed/EmbedPage')) },
];

export const router = __DEMO__ ? createHashRouter(routes) : createBrowserRouter(routes);
