/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as MatchMatchIdRouteImport } from './routes/match.$matchId'
import { Route as BatchRouteImport } from './routes/batch'
import { Route as SimulationRouteImport } from './routes/simulation'
import { Route as EnginesRouteImport } from './routes/engines'
import { Route as EvidenceRouteImport } from './routes/evidence'
import { Route as PredictionsRouteImport } from './routes/predictions'
import { Route as AuditRouteImport } from './routes/audit'
const IndexRoute=IndexRouteImport.update({id:'/',path:'/',getParentRoute:()=>rootRouteImport} as any)
const MatchMatchIdRoute=MatchMatchIdRouteImport.update({id:'/match/$matchId',path:'/match/$matchId',getParentRoute:()=>rootRouteImport} as any)
const BatchRoute=BatchRouteImport.update({id:'/batch',path:'/batch',getParentRoute:()=>rootRouteImport} as any)
const SimulationRoute=SimulationRouteImport.update({id:'/simulation',path:'/simulation',getParentRoute:()=>rootRouteImport} as any)
const EnginesRoute=EnginesRouteImport.update({id:'/engines',path:'/engines',getParentRoute:()=>rootRouteImport} as any)
const EvidenceRoute=EvidenceRouteImport.update({id:'/evidence',path:'/evidence',getParentRoute:()=>rootRouteImport} as any)
const PredictionsRoute=PredictionsRouteImport.update({id:'/predictions',path:'/predictions',getParentRoute:()=>rootRouteImport} as any)
const AuditRoute=AuditRouteImport.update({id:'/audit',path:'/audit',getParentRoute:()=>rootRouteImport} as any)
export interface FileRoutesByFullPath {'/':typeof IndexRoute;'/match/$matchId':typeof MatchMatchIdRoute;'/batch':typeof BatchRoute;'/simulation':typeof SimulationRoute;'/engines':typeof EnginesRoute;'/evidence':typeof EvidenceRoute;'/predictions':typeof PredictionsRoute;'/audit':typeof AuditRoute}
export interface FileRoutesByTo extends FileRoutesByFullPath {}
export interface FileRoutesById {__root__:typeof rootRouteImport;'/':typeof IndexRoute;'/match/$matchId':typeof MatchMatchIdRoute;'/batch':typeof BatchRoute;'/simulation':typeof SimulationRoute;'/engines':typeof EnginesRoute;'/evidence':typeof EvidenceRoute;'/predictions':typeof PredictionsRoute;'/audit':typeof AuditRoute}
export interface FileRouteTypes {fileRoutesByFullPath:FileRoutesByFullPath;fullPaths:keyof FileRoutesByFullPath;fileRoutesByTo:FileRoutesByTo;to:keyof FileRoutesByTo;id:keyof FileRoutesById;fileRoutesById:FileRoutesById}
declare module '@tanstack/react-router' { interface FileRoutesByPath {'/':{id:'/';path:'/';fullPath:'/';preLoaderRoute:typeof IndexRouteImport;parentRoute:typeof rootRouteImport};'/match/$matchId':{id:'/match/$matchId';path:'/match/$matchId';fullPath:'/match/$matchId';preLoaderRoute:typeof MatchMatchIdRouteImport;parentRoute:typeof rootRouteImport};'/batch':{id:'/batch';path:'/batch';fullPath:'/batch';preLoaderRoute:typeof BatchRouteImport;parentRoute:typeof rootRouteImport};'/simulation':{id:'/simulation';path:'/simulation';fullPath:'/simulation';preLoaderRoute:typeof SimulationRouteImport;parentRoute:typeof rootRouteImport};'/engines':{id:'/engines';path:'/engines';fullPath:'/engines';preLoaderRoute:typeof EnginesRouteImport;parentRoute:typeof rootRouteImport};'/evidence':{id:'/evidence';path:'/evidence';fullPath:'/evidence';preLoaderRoute:typeof EvidenceRouteImport;parentRoute:typeof rootRouteImport};'/predictions':{id:'/predictions';path:'/predictions';fullPath:'/predictions';preLoaderRoute:typeof PredictionsRouteImport;parentRoute:typeof rootRouteImport};'/audit':{id:'/audit';path:'/audit';fullPath:'/audit';preLoaderRoute:typeof AuditRouteImport;parentRoute:typeof rootRouteImport}}}
export interface RootRouteChildren {IndexRoute:typeof IndexRoute;MatchMatchIdRoute:typeof MatchMatchIdRoute;BatchRoute:typeof BatchRoute;SimulationRoute:typeof SimulationRoute;EnginesRoute:typeof EnginesRoute;EvidenceRoute:typeof EvidenceRoute;PredictionsRoute:typeof PredictionsRoute;AuditRoute:typeof AuditRoute}
const rootRouteChildren={IndexRoute,MatchMatchIdRoute,BatchRoute,SimulationRoute,EnginesRoute,EvidenceRoute,PredictionsRoute,AuditRoute} as RootRouteChildren
export const routeTree=rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()
import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' { interface Register {ssr:true;router:Awaited<ReturnType<typeof getRouter>>;config:Awaited<ReturnType<typeof startInstance.getOptions>>} }
