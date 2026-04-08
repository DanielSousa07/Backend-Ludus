import multer from "multer";

const storage = multer.memoryStorage();

export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Formato inválido. Envie JPG, PNG ou WEBP."));
    }

    cb(null, true);
  },
});