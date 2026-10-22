import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../config.js";
import { readSetting } from "../services/settings.service.js";

const consultationService = z.object({
  name: z.string().min(1),
  dropdownLabel: z.string().optional(),
  goalLabel: z.string().min(1),
  goalPlaceholder: z.string().min(1),
  stages: z.array(z.string()),
  deadlineLabel: z.string().min(1),
  support: z.array(z.string()),
  checklist: z.array(z.string()),
  closing: z.string().min(1),
});

const consultationServices = z.object({
  help: consultationService,
  statement: consultationService,
  applicationStrategy: consultationService,
  cv: consultationService,
  linkedin: consultationService,
  interview: consultationService,
  coverLetter: consultationService,
  careerBundle: consultationService,
  scholarshipEssay: consultationService,
  mbaDirection: consultationService,
  mbaEssay: consultationService,
  mbaInterview: consultationService,
  mbaPackage: consultationService,
});

const copyFact = z.object({ label: z.string().min(1), text: z.string().min(1) });
const copyLink = z.object({ label: z.string().min(1), href: z.string().min(1) });
const publicCopySchema = z.object({
  home: z.object({
    hero: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      titleLead: z.string().min(1),
      titleAccent: z.string().min(1),
      description: z.string().min(1),
      buttons: z.array(copyLink).length(3),
      qualifier: z.string().min(1),
    }),
    auditExample: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      steps: z.array(z.object({ title: z.string().min(1), description: z.string().min(1) })).min(1),
      link: z.string().min(1),
      footer: z.string().min(1),
    }),
    features: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      cards: z.array(z.object({
        number: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        href: z.string().min(1),
        link: z.string().min(1),
      })).min(1),
    }),
    feedbackExample: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      disclaimer: z.string().min(1),
      quoteLabel: z.string().min(1),
      quote: z.string().min(1),
      insightTitle: z.string().min(1),
      insightDescription: z.string().min(1),
      link: z.string().min(1),
    }),
    testimonial: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      link: z.string().min(1),
      empty: z.string().min(1),
    }),
    resources: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      resourcesLink: z.string().min(1),
      blogLink: z.string().min(1),
    }),
    article: z.object({
      eyebrow: z.string().min(1),
      readLink: z.string().min(1),
      browseLink: z.string().min(1),
    }),
    callout: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      auditLink: z.string().min(1),
      consultationLink: z.string().min(1),
    }),
  }),
  services: z.object({
    hero: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      callLink: z.string().min(1),
      pricingLink: z.string().min(1),
      startingPointEyebrow: z.string().min(1),
      startingPointTitle: z.string().min(1),
      startingPoints: z.array(z.string().min(1)).min(1),
      note: z.string().min(1),
    }),
    offers: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      fallbackCategory: z.string().min(1),
      exploreLink: z.string().min(1),
    }),
    audit: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      link: z.string().min(1),
      startingPointTitle: z.string().min(1),
      startingPoints: z.array(z.object({ title: z.string().min(1), description: z.string().min(1) })).min(1),
    }),
    process: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      steps: z.array(z.object({
        eyebrow: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
      })).min(1),
    }),
    faq: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      link: z.string().min(1),
    }),
    testimonial: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      link: z.string().min(1),
    }),
  }),
  pricing: z.object({
    page: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
    }),
    currencySymbol: z.string().min(1),
    customQuote: z.string().min(1),
    requestQuote: z.string().min(1),
    enquirePrefix: z.string().min(1),
    packages: z.object(Object.fromEntries([
      "career-cv",
      "career-cover-letter",
      "career-linkedin",
      "career-bundle",
      "career-interview",
      "admissions-clarity",
      "admissions-precision",
      "admissions-distinction",
      "scholarships-clarity",
      "scholarships-precision",
      "scholarships-distinction",
      "mba-essentials",
      "mba-mastery",
      "mba-full-ride",
    ].map((key) => [key, z.object({
      title: z.string().min(1),
      unit: z.string().min(1),
      description: z.string().optional(),
      inclusions: z.array(z.string().min(1)),
    })]))),
    career: z.object({
      experienceStatus: z.string().min(1),
      exactTenNote: z.string().min(1),
      experienceKicker: z.string().min(1),
      interviewKicker: z.string().min(1),
      savingTemplate: z.string().min(1),
      facts: z.array(copyFact).min(1),
      termsTitle: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
      cancellationStages: z.array(z.string().min(1)).length(3),
    }),
    admissions: z.object({
      intro: z.string().min(1),
      priceDescription: z.string().min(1),
      kicker: z.string().min(1),
      facts: z.array(copyFact).min(1),
      termsTitle: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
      cancellationStages: z.array(z.string().min(1)).length(3),
      note: z.string().min(1),
    }),
    scholarships: z.object({
      assessmentLabel: z.string().min(1),
      assessmentHint: z.string().min(1),
      assessmentStatus: z.string().min(1),
      quoteStatus: z.string().min(1),
      bandStatus: z.string().min(1),
      customQuoteUnit: z.string().min(1),
      unit: z.string().min(1),
      facts: z.array(copyFact).min(1),
      termsTitle: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
      cancellationStages: z.array(z.string().min(1)).length(3),
    }),
    mba: z.object({
      minimum: z.string().min(1),
      paymentOptions: z.object({ single: z.string().min(1), instalments: z.string().min(1) }),
      summary: z.string().min(1),
      discountApplied: z.string().min(1),
      totalUnitTemplate: z.string().min(1),
      perSchoolTemplate: z.string().min(1),
      singleKicker: z.string().min(1),
      instalmentsKicker: z.string().min(1),
      facts: z.array(copyFact).min(1),
      termsTitle: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
      cancellationStages: z.array(z.string().min(1)).length(3),
    }),
    cancellation: z.object({
      title: z.string().min(1),
      amounts: z.array(z.string().min(1)).length(3),
      note: z.string().min(1),
    }),
    callout: z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      primaryLink: z.string().min(1),
      secondaryLink: z.string().min(1),
    }),
  }),
});

const publicContentSchema = z.object({
  consultation_services: consultationServices,
});

export async function getPublicPricingCopy(_request: Request, response: Response): Promise<void> {
  const savedCopy = await readSetting("site_business_copy");
  if (savedCopy === undefined) {
    throw new HttpError(500, "Service pricing details have not been configured.", "PRICING_COPY_NOT_CONFIGURED");
  }
  const parsedCopy = publicCopySchema.pick({ pricing: true }).safeParse(savedCopy);
  if (!parsedCopy.success) {
    throw new HttpError(500, "Saved service pricing details are invalid.", "PRICING_COPY_INVALID");
  }
  response.json({ pricing: parsedCopy.data.pricing });
}

export async function getPublicConsultationServices(_request: Request, response: Response): Promise<void> {
  const savedContent = await readSetting("site_public_content");
  if (savedContent === undefined) {
    throw new HttpError(500, "Consultation services have not been configured.", "CONSULTATION_CONFIG_NOT_CONFIGURED");
  }
  const parsedServices = publicContentSchema.pick({ consultation_services: true }).safeParse(savedContent);
  if (!parsedServices.success) {
    throw new HttpError(500, "Saved consultation service details are invalid.", "CONSULTATION_CONFIG_INVALID");
  }
  response.json({ consultation_services: parsedServices.data.consultation_services });
}
