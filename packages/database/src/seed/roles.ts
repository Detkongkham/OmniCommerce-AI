import { PERMISSIONS, SYSTEM_ROLE_OWNER, type Permission, type PermissionModule } from "@oca/shared";

export interface RoleDefinition {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: readonly Permission[];
}

const readWrite = (...modules: PermissionModule[]): Permission[] =>
  modules.flatMap((m) => [`${m}:read` as const, `${m}:write` as const]);

const readOnly = (...modules: PermissionModule[]): Permission[] => modules.map((m) => `${m}:read` as const);

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    name: SYSTEM_ROLE_OWNER,
    description: "ເຈົ້າຂອງຮ້ານ: ເຂົ້າເຖິງໄດ້ທຸກຢ່າງ",
    isSystem: true,
    permissions: PERMISSIONS,
  },
  {
    name: "MANAGER",
    description: "ຜູ້ຈັດການ: ທຸກຢ່າງຍົກເວັ້ນການແກ້ໄຂພະນັກງານ ແລະ role",
    isSystem: false,
    permissions: PERMISSIONS.filter((p) => p !== "staff:write"),
  },
  {
    name: "CHAT_ADMIN",
    description: "ແອດມິນແຊັດ: ຕອບແຊັດ, ດູແລ Live/CF",
    isSystem: false,
    permissions: [...readWrite("inbox", "live-cf"), ...readOnly("crm", "inventory", "promotion")],
  },
  {
    name: "WAREHOUSE",
    description: "ພະນັກງານສາງ: ສະຕ໋ອກ ແລະ ການຈັດສົ່ງ",
    isSystem: false,
    permissions: readWrite("inventory", "logistics"),
  },
  {
    name: "ACCOUNTANT",
    description: "ບັນຊີ: ເບິ່ງລາຍງານ ແລະ ຂໍ້ມູນທີ່ກ່ຽວຂ້ອງ (ອ່ານຢ່າງດຽວ)",
    isSystem: false,
    permissions: readOnly("analytics", "inventory", "crm", "logistics"),
  },
];
