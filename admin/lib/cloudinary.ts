import { v2 as cloudinary } from "cloudinary";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 4 * 1024 * 1024;

function configured() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Faltan las credenciales de Cloudinary en el entorno.");
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return { client: cloudinary, cloud_name, api_key, api_secret };
}

function folder() {
  return process.env.CLOUDINARY_FOLDER?.trim() || "campus/routes";
}

function publicId(routeId: number) {
  return `${folder()}/${routeId}`;
}

function asCloudinaryError(error: unknown) {
  const record = error as {
    http_code?: number;
    message?: string;
    error?: { message?: string };
  };
  return {
    httpCode: record.http_code,
    message: record.error?.message ?? record.message ?? "",
  };
}

function throwUploadError(error: unknown): never {
  const { httpCode, message } = asCloudinaryError(error);
  if (httpCode === 403 || /missing permissions/i.test(message)) {
    throw new Error(
      "Cloudinary rechazó la subida: esta API key no tiene permiso de crear archivos. En consola.cloudinary.com → Settings → API Keys, edita la clave y activa Create/Upload, o genera una clave con rol Admin.",
    );
  }
  throw new Error(message || "No se pudo subir la miniatura a Cloudinary.");
}

export async function uploadRouteImage(routeId: number, file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("La miniatura tiene que ser PNG, JPEG, WebP o GIF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La miniatura no puede pesar más de 4 MB.");
  }

  const { client } = configured();
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
  try {
    const result = await client.uploader.upload(dataUri, {
      folder: folder(),
      public_id: String(routeId),
      overwrite: true,
      invalidate: true,
      resource_type: "image",
    });
    return result.secure_url;
  } catch (error) {
    throwUploadError(error);
  }
}

export async function deleteRouteImage(routeId: number) {
  try {
    await configured().client.uploader.destroy(publicId(routeId), { invalidate: true });
  } catch {
    // Si Cloudinary no tiene el archivo, igual se puede borrar la fila.
  }
}
