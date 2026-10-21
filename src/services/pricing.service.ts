import { HttpError } from "../config.js";
import { servicePricingSchema, type ServicePricing } from "../pricing.js";
import { readSetting } from "./settings.service.js";

export async function readServicePricing(): Promise<ServicePricing> {
  const savedPricing = await readSetting("service_pricing");
  if (savedPricing === undefined) {
    throw new HttpError(500, "Service pricing has not been configured in the database.", "PRICING_NOT_CONFIGURED");
  }
  const parsedPricing = servicePricingSchema.safeParse(savedPricing);
  if (!parsedPricing.success) {
    throw new HttpError(500, "Saved service pricing settings are invalid.", "SETTINGS_INVALID");
  }
  return parsedPricing.data;
}
