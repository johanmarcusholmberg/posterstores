import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postersRouter from "./posters";
import posterSizesRouter from "./posterSizes";
import cartRouter from "./cart";
import favoritesRouter from "./favorites";
import ordersRouter from "./orders";
import newsletterRouter from "./newsletter";
import statsRouter from "./stats";
import mockupsRouter from "./mockups";
import storesRouter from "./stores";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(postersRouter);
router.use(posterSizesRouter);
router.use(cartRouter);
router.use(favoritesRouter);
router.use(ordersRouter);
router.use(newsletterRouter);
router.use(statsRouter);
router.use(mockupsRouter);
router.use(storesRouter);

export default router;
