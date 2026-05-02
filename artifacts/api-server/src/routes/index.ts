import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postersRouter from "./posters";
import cartRouter from "./cart";
import favoritesRouter from "./favorites";
import ordersRouter from "./orders";
import newsletterRouter from "./newsletter";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postersRouter);
router.use(cartRouter);
router.use(favoritesRouter);
router.use(ordersRouter);
router.use(newsletterRouter);
router.use(statsRouter);

export default router;
