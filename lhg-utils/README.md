# @lhg/utils

Utilitários compartilhados para os backends do LHG Analytics.

## Instalação

```bash
npm install file:../lhg-utils
```

## Módulos

### DateUtilsService

Serviço para manipulação de datas, usado em todos os backends.

```typescript
import { DateUtilsService } from '@lhg/utils';

// No constructor
constructor(private readonly dateUtilsService: DateUtilsService) {}

// Usar
const date = this.dateUtilsService.convertToDate('01/01/2025');
```

### Funcionalidades

- `convertToDate()` - Converte string DD/MM/YYYY para Date
- `formatDateBR()` - Formata Date para DD/MM/YYYY
- `formatDateKey()` - Converte data para YYYY-MM-DD
- `formatDateDisplay()` - Converte YYYY-MM-DD para DD/MM/YYYY
- `formatDateToMonth()` - Converte YYYY-MM-DD para MM/YYYY
- `calculateTotalDays()` - Calcula total de dias no período
- `calculateCurrentMonthPeriod()` - Calcula período do mês atual
- `calculatePreviousPeriod()` - Calcula período anterior
- `generatePeriodRange()` - Gera array de períodos

## Desenvolvimento

```bash
npm install
npm run build
```
