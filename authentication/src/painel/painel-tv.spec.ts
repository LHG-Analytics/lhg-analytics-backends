import { canaisDasReservas } from './painel-tv';

// Formato real de Bookings/bookings/date-range (lhg-api): BigNumbersEcommerce
// e KpiTableByChannelType por canal. Números de teste.
const kpi = (qtd: Record<string, number>, val: Record<string, number>) => [
  {
    bookingsTotalRentalsByChannelType: { ...qtd, TOTALALLBOOKINGS: 999 },
    bookingsRevenueByChannelType: { ...val, TOTALALLVALUE: 99999 },
  },
];

describe('canaisDasReservas (Painel TV)', () => {
  it('unidade com site: e-commerce do BigNumbersEcommerce e Guia = GO + Programada (sem o total da unidade)', () => {
    expect(
      canaisDasReservas({
        BigNumbers: [
          { currentDate: { totalAllValue: 5000, totalAllBookings: 40 } },
        ],
        BigNumbersEcommerce: [
          { currentDate: { totalAllValue: 1234.5, totalAllBookings: 9 } },
        ],
        KpiTableByChannelType: kpi(
          { GUIA_GO: 3, GUIA_SCHEDULED: 2, WEBSITE_IMMEDIATE: 5, INTERNAL: 7 },
          {
            GUIA_GO: 300.1,
            GUIA_SCHEDULED: 200.2,
            WEBSITE_IMMEDIATE: 600,
            INTERNAL: 700,
          },
        ),
      }),
    ).toEqual({
      reservasEcommerce: 9,
      receitaEcommerce: 1234.5,
      reservasGuia: 5,
      receitaGuia: 500.3,
    });
  });

  it('Getan (sem site): e-commerce 0 e só o Guia', () => {
    expect(
      canaisDasReservas({
        BigNumbersEcommerce: [
          { currentDate: { totalAllValue: 0, totalAllBookings: 0 } },
        ],
        KpiTableByChannelType: kpi(
          { GUIA_GO: 4, GUIA_SCHEDULED: 1, INTERNAL: 2 },
          { GUIA_GO: 180, GUIA_SCHEDULED: 95.5, INTERNAL: 50 },
        ),
      }),
    ).toEqual({
      reservasEcommerce: 0,
      receitaEcommerce: 0,
      reservasGuia: 5,
      receitaGuia: 275.5,
    });
  });

  it('resposta sem os blocos (ou vazia) → tudo 0, sem erro', () => {
    const zero = {
      reservasEcommerce: 0,
      receitaEcommerce: 0,
      reservasGuia: 0,
      receitaGuia: 0,
    };
    expect(canaisDasReservas(undefined)).toEqual(zero);
    expect(canaisDasReservas({})).toEqual(zero);
    expect(
      canaisDasReservas({ BigNumbersEcommerce: [], KpiTableByChannelType: [] }),
    ).toEqual(zero);
  });

  it('soma do Guia sem erro de ponto flutuante (2 casas)', () => {
    expect(
      canaisDasReservas({
        KpiTableByChannelType: kpi(
          { GUIA_GO: 1, GUIA_SCHEDULED: 1 },
          { GUIA_GO: 0.1, GUIA_SCHEDULED: 0.2 },
        ),
      }).receitaGuia,
    ).toBe(0.3);
  });
});
