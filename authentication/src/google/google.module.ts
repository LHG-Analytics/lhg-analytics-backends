import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { GoogleController } from './google.controller';
import {
  GoogleIdentityProvider,
  RealGoogleIdentityProvider,
} from './google-identity.provider';
import { GoogleLoginService } from './google-login.service';

@Module({
  imports: [AuthModule, InvitationsModule],
  controllers: [GoogleController],
  providers: [
    GoogleLoginService,
    { provide: GoogleIdentityProvider, useClass: RealGoogleIdentityProvider },
  ],
})
export class GoogleModule {}
