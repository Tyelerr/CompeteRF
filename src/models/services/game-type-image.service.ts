import { supabase } from "../../lib/supabase";

const BUCKET_NAME = "game-type-images";

// Map game types to their image file names
const GAME_TYPE_FILE_MAP: Record<string, string> = {
  "8-Ball": "8-ball.png",
  "9-Ball": "9-ball.png",
  "10-Ball": "10-ball.png",
  "One-Pocket": "one-pocket.png",
  "Bank Pool": "bank-pool.png",
  "Straight Pool": "straight-pool.png",
};

const DEFAULT_IMAGE = "default.png";

/**
 * Get the public URL for a game type image
 */
export const getGameTypeImageUrl = (gameType: string): string => {
  const fileName = GAME_TYPE_FILE_MAP[gameType] || DEFAULT_IMAGE;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

  return data.publicUrl;
};

/**
 * Get all game type images (useful for selection UI)
 */
export const getAllGameTypeImages = (): {
  gameType: string;
  imageUrl: string;
}[] => {
  return Object.entries(GAME_TYPE_FILE_MAP).map(([gameType, fileName]) => ({
    gameType,
    imageUrl: supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName).data
      .publicUrl,
  }));
};

/**
 * Upload a new game type image (admin only)
 */
export const uploadGameTypeImage = async (
  fileName: string,
  file: File | Blob,
): Promise<{ success: boolean; url?: string; error?: string }> => {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    return { success: false, error: "Failed to upload image" };
  }
};

/**
 * List all images in the bucket
 */
export const listGameTypeImages = async (): Promise<string[]> => {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list();

  if (error) {
    console.error("Error listing game type images:", error);
    return [];
  }

  return data.map((file: { name: string }) => file.name);
};
