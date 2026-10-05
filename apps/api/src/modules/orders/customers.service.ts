import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CustomerListQuery } from "@oca/shared";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";

export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

/** ຄົ້ນຫາລູກຄ້າຢ່າງດຽວ ສຳລັບຟອມສ້າງບິນ. ການຈັດການລູກຄ້າເຕັມ (CRM) ເປັນໂມດູນແຍກ. */
@Injectable()
export class CustomersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(query: CustomerListQuery): Promise<Page<CustomerDto>> {
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { phone: { contains: query.q } },
            { email: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: { id: true, name: true, phone: true, email: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return toPage(rows, total, query.page, query.pageSize);
  }
}
