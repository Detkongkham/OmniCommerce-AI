import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type ConversationListQuery,
  type CreateCustomerFromChatInput,
  type MessageListQuery,
  type SendMessageInput,
  type UpdateConversationInput,
  conversationListQuerySchema,
  createCustomerFromChatSchema,
  messageListQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ConversationsService } from "./conversations.service";

/** ເບິ່ງ = inbox:read; ຕອບ/ມອບໝາຍ/ປິດ/ລິ້ງລູກຄ້າ/ໝາຍອ່ານແລ້ວ = inbox:write */
@Controller("conversations")
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get()
  @RequirePermissions("inbox:read")
  list(
    @Query(new ZodValidationPipe(conversationListQuerySchema)) query: ConversationListQuery,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.conversations.list(query, actor);
  }

  @Get(":id")
  @RequirePermissions("inbox:read")
  get(@Param("id") id: string) {
    return this.conversations.get(id);
  }

  @Get(":id/messages")
  @RequirePermissions("inbox:read")
  messages(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(messageListQuerySchema)) query: MessageListQuery,
  ) {
    return this.conversations.listMessages(id, query);
  }

  @Post(":id/messages")
  @RequirePermissions("inbox:write")
  send(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.conversations.sendMessage(id, body, actor);
  }

  @Patch(":id")
  @RequirePermissions("inbox:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: UpdateConversationInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.conversations.update(id, body, actor, req.ip);
  }

  @Post(":id/read")
  @HttpCode(200)
  @RequirePermissions("inbox:write")
  markRead(@Param("id") id: string) {
    return this.conversations.markRead(id);
  }

  @Post(":id/customer")
  @RequirePermissions("inbox:write")
  createCustomer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createCustomerFromChatSchema)) body: CreateCustomerFromChatInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.conversations.createCustomer(id, body, actor, req.ip);
  }
}
