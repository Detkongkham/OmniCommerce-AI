import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false;
    }
  }

  /** ໃຊ້ເວລາໃກ້ກັບການ verify ຈິງ ເມື່ອບໍ່ພົບ user ເພື່ອບໍ່ໃຫ້ເດົາ email ຈາກເວລາຕອບໄດ້. */
  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= hash("dummy-password-for-timing");
    await this.verify(await this.dummyHash, plain);
  }
}
