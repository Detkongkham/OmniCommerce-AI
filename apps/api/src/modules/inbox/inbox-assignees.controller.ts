import { Controller, Get, Inject } from "@nestjs/common";
import { RequirePermissions } from "../../common/decorators";
import { ConversationsService } from "./conversations.service";

@Controller("inbox")
export class InboxAssigneesController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get("assignees")
  @RequirePermissions("inbox:read")
  list() {
    return this.conversations.listAssignees();
  }
}
