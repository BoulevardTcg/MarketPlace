import type { PrismaClient } from "@prisma/client";

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.sellerReview.deleteMany();
  await prisma.listingQuestion.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.listingShipping.deleteMany();
  await prisma.userActiveProfile.deleteMany();
  await prisma.dailyPriceSnapshot.deleteMany();
  await prisma.cardPriceSnapshot.deleteMany();
  await prisma.externalProductRef.deleteMany();
  await prisma.userPortfolioSnapshot.deleteMany();
  await prisma.userModerationState.deleteMany();
  await prisma.listingReport.deleteMany();
  await prisma.moderationAction.deleteMany();
  await prisma.sellerReputation.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.handover.deleteMany();
  await prisma.listingEvent.deleteMany();
  await prisma.tradeMessage.deleteMany();
  await prisma.tradeReadState.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.tradeOffer.deleteMany();
  await prisma.userCollection.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.priceAlert.deleteMany();
}
