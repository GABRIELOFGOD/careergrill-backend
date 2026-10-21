import type { Request, Response } from "express";
import { readServicePricing } from "../services/pricing.service.js";

export async function getPublicPricing(_request: Request, response: Response): Promise<void> {
  response.json({ pricing: await readServicePricing() });
}
