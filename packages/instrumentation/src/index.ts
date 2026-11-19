export { HopLogger } from "./hop-logger";
export type { HopMode, HopRecord, HopRecordInput } from "./hop-logger";

export { TracedHttpService, hostOf, pathOf } from "./traced-http.service";
export type { HttpLike, TracedHttpOptions } from "./traced-http.service";

export { InProcessHttpService } from "./in-process/in-process-http.service";
export type { InProcessHttpOptions } from "./in-process/in-process-http.service";

export { InProcessRegistry } from "./in-process/in-process-registry";
export { InProcessHttpError } from "./in-process/in-process.types";
export type {
  InProcessHandler,
  InProcessRequest,
  InProcessResponse,
  InProcessRouteDefinition,
} from "./in-process/in-process.types";

export {
  pgReadHandlers,
  closeInProcessPools,
} from "./in-process/pg-read-handlers";

export { TraceMiddleware } from "./trace.middleware";
export { currentTrace, runWithTrace, traceStorage } from "./trace-context";
export type { TraceContext } from "./trace-context";

export {
  InstrumentationModule,
  RawHttpModule,
  RAW_HTTP_SERVICE,
  buildInProcessRegistry,
  createHttpClient,
  serviceClientMode,
} from "./instrumentation.module";
