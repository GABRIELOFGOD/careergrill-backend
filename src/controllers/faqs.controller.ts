import type { Request, Response } from "express";
import { z } from "zod";
import { faqInput, faqUpdate } from "../faqs.js";
import {
  createFaq,
  deleteFaq,
  listAdminFaqs,
  listPublishedFaqs,
  updateFaq,
} from "../services/faqs.service.js";

export async function getPublishedFaqs(_request: Request, response: Response): Promise<void> {
  response.json({ items: await listPublishedFaqs() });
}

export async function getAdminFaqs(_request: Request, response: Response): Promise<void> {
  response.json({ items: await listAdminFaqs() });
}

export async function postAdminFaq(request: Request, response: Response): Promise<void> {
  response.status(201).json({ item: await createFaq(faqInput.parse(request.body)) });
}

export async function patchAdminFaq(request: Request, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  response.json({ item: await updateFaq(id, faqUpdate.parse(request.body)) });
}

export async function deleteAdminFaq(request: Request, response: Response): Promise<void> {
  await deleteFaq(z.string().uuid().parse(request.params.id));
  response.status(204).end();
}
