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
import shippingRouter from "./shipping";
import launchChecklistRouter from "./launchChecklist";
import stripeRouter from "./stripe";

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
router.use(shippingRouter);
router.use(launchChecklistRouter);
router.use(stripeRouter);

export default router;
