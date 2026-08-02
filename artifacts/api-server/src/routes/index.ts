import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import dashboardRouter from "./dashboard.js";
import commandLogsRouter from "./commandLogs.js";
import blacklistRouter from "./blacklist.js";
import statsRouter from "./stats.js";
import serversRouter from "./servers.js";
import usersRouter from "./users.js";
import adminRouter from "./admin.js";
import auditLogsRouter from "./auditLogs.js";
import botRouter from "./bot.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(commandLogsRouter);
router.use(blacklistRouter);
router.use(statsRouter);
router.use(serversRouter);
router.use(usersRouter);
router.use(adminRouter);
router.use(auditLogsRouter);
router.use(botRouter);

export default router;
