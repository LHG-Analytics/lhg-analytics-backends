import { Module } from '@nestjs/common';
import {
  InvitationAcceptController,
  InvitationsController,
} from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  // O controller público vem primeiro: "accept/..." antes de ":id".
  controllers: [InvitationAcceptController, InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
