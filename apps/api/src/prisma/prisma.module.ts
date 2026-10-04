import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { ENV, type Env } from "../config/env";

export const PRISMA = Symbol("PRISMA");

class PrismaLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ENV],
      useFactory: (env: Env) => createPrismaClient(env.DATABASE_URL),
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
