import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import ordersRouter from "./orders";
import packagesRouter from "./packages";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(packagesRouter);
router.use(ordersRouter);
router.use(adminRouter);
router.use(uploadsRouter);

export default router;
