import { Module } from '@nestjs/common';
import { CrmEtlService } from './crm-etl.service';

/** Job do CRM (Automo → raw do Supabase do CRM). Sem rota HTTP; desligado sem env. */
@Module({
  providers: [CrmEtlService],
})
export class CrmEtlModule {}
