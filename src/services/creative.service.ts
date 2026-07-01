import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { getOwnedMetaAccount, getOwnedMetaAccountByAdAccountId } from "./metaAccount.service";
import { MetaAccountClient } from "./meta.service";

async function resolveAccount(
  userId: string,
  lookup: { metaAccountId?: string; metaAdAccountId?: string },
  externalCustomerId?: string
) {
  const account = lookup.metaAccountId
    ? await getOwnedMetaAccount(userId, lookup.metaAccountId)
    : await getOwnedMetaAccountByAdAccountId(userId, lookup.metaAdAccountId!);

  if (externalCustomerId && account.externalCustomerId !== externalCustomerId) {
    throw new AppError("This Meta account does not belong to the specified customer", 403);
  }
  return account;
}

export async function uploadAndCreateCreative(
  userId: string,
  lookup: { metaAccountId?: string; metaAdAccountId?: string },
  file: Express.Multer.File,
  body: {
    headline?: string;
    description?: string;
    callToAction?: string;
    linkUrl?: string;
    externalCustomerId?: string;
  }
) {
  if (!lookup.metaAccountId && !lookup.metaAdAccountId) {
    throw new AppError("Provide metaAccountId or metaAdAccountId", 400);
  }

  const metaAccount = await resolveAccount(userId, lookup, body.externalCustomerId);
  const client = new MetaAccountClient(metaAccount);

  const isVideo = file.mimetype.startsWith("video/");
  const isImage = file.mimetype.startsWith("image/");

  if (!isImage && !isVideo) {
    throw new AppError("Only image or video files are supported", 400);
  }

  // Step 1: Upload media to Meta
  let imageHash: string | undefined;
  let videoId: string | undefined;

  if (isImage) {
    const result = await client.uploadImage(file.buffer, file.originalname);
    imageHash = result.imageHash;
  } else {
    const result = await client.uploadVideo(
      file.buffer,
      file.originalname,
      body.headline ?? file.originalname
    );
    videoId = result.videoId;
  }

  // Step 2: Save creative record in DB
  const creative = await prisma.adCreative.create({
    data: {
      metaAccountId: metaAccount.id,
      mediaType: isImage ? "IMAGE" : "VIDEO",
      imageHash,
      videoId,
      headline: body.headline,
      body: body.description,
      callToAction: body.callToAction,
      linkUrl: body.linkUrl,
    },
  });

  return creative;
}

export async function listCreatives(
  userId: string,
  filters: { metaAccountId?: string; metaAdAccountId?: string; externalCustomerId?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

  const where = {
    metaAccount: {
      userId,
      ...(filters.externalCustomerId ? { externalCustomerId: filters.externalCustomerId } : {}),
      ...(filters.metaAdAccountId ? { metaAdAccountId: filters.metaAdAccountId } : {}),
    },
    ...(filters.metaAccountId ? { metaAccountId: filters.metaAccountId } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.adCreative.count({ where }),
    prisma.adCreative.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getCreative(userId: string, creativeId: string, externalCustomerId?: string) {
  const creative = await prisma.adCreative.findFirst({
    where: {
      id: creativeId,
      metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
    },
  });
  if (!creative) throw new AppError("Creative not found", 404);
  return creative;
}

export async function deleteCreative(userId: string, creativeId: string, externalCustomerId?: string) {
  await getCreative(userId, creativeId, externalCustomerId);
  await prisma.adCreative.delete({ where: { id: creativeId } });
}

// Attach a creative to an Ad
export async function attachCreativeToAd(
  userId: string,
  adId: string,
  creativeId: string,
  externalCustomerId?: string
) {
  // Verify both ad and creative belong to same user/customer
  const ad = await prisma.ad.findFirst({
    where: { id: adId, metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) } },
  });
  if (!ad) throw new AppError("Ad not found", 404);

  await getCreative(userId, creativeId, externalCustomerId);

  return prisma.ad.update({
    where: { id: adId },
    data: { creativeId },
    include: { creative: true },
  });
}
