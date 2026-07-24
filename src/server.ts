import "dotenv/config";
import app from "./app";
import config from "./config";

const PORT = config.port ?? "8080";

async function main() {
  try {
    // Verify DATABASE_URL is present before starting; Prisma's $connect() is
    // lazy and resolves successfully even without a valid URL, so we can't
    // rely on it to surface config errors.
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Add it to your .env file.");
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API Docs (Swagger UI):  http://localhost:${PORT}/api/docs`);
      console.log(`API Docs (JSON spec):   http://localhost:${PORT}/api/docs.json`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1);
  }
}

main();
