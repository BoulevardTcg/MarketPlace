process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./.db/test.db";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.PORT = process.env.PORT ?? "0";
