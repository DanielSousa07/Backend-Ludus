import { Expo } from "expo-server-sdk";
import { prisma } from "../lib/prisma";

const expo = new Expo();

export async function sendPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  data?: any;
  channelId?: "rentals" | "system" | "default";
}) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: params.userId },
    select: { expoPushToken: true },
  });

  const messages = tokens
    .map((t) => t.expoPushToken)
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: "default" as const,
      title: params.title,
      body: params.body,
      data: params.data ?? {},
      channelId: params.channelId ?? "default",
    }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error("Expo push error:", e);
    }
  }
}