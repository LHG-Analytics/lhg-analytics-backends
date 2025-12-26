import { Prisma } from '@client-local';

export class Booking implements Prisma.BookingsUncheckedCreateInput {
  id?: number;
  BookingsRepresentativenessByChannelType?: Prisma.BookingsRepresentativenessByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput;
  BookingsRevenueByPayment?: Prisma.BookingsRevenueByPaymentUncheckedCreateNestedManyWithoutBookingsInput;
  BookingsTicketAverageByChannelType?: Prisma.BookingsTicketAverageByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput;
  BookingsTotalRentalsByChannelType?: Prisma.BookingsTotalRentalsByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsRevenueByChannelType?: Prisma.BookingsRevenueByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsRepresentativeness?: Prisma.BookingsRepresentativenessUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsRepresentativenessByPeriod?: Prisma.BookingsRepresentativenessByPeriodUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsRevenue?: Prisma.BookingsRevenueUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsRevenueByPeriod?: Prisma.BookingsRevenueByPeriodUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsTicketAverage?: Prisma.BookingsTicketAverageUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsTotalRentals?: Prisma.BookingsTotalRentalsUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsTotalRentalsByPeriod?: Prisma.BookingsTotalRentalsByPeriodUncheckedCreateNestedManyWithoutBookingsInput;
  bookingsTotalRentalsByRentalType?: Prisma.BookingsTotalRentalsByRentalTypeUncheckedCreateNestedManyWithoutBookingsInput;
  companyId: number;

  constructor(
    companyId: number,
    id?: number,
    BookingsRepresentativenessByChannelType?: Prisma.BookingsRepresentativenessByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput,
    BookingsRevenueByPayment?: Prisma.BookingsRevenueByPaymentUncheckedCreateNestedManyWithoutBookingsInput,
    BookingsTicketAverageByChannelType?: Prisma.BookingsTicketAverageByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput,
    BookingsTotalRentalsByChannelType?: Prisma.BookingsTotalRentalsByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsRevenueByChannelType?: Prisma.BookingsRevenueByChannelTypeUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsRepresentativeness?: Prisma.BookingsRepresentativenessUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsRepresentativenessByPeriod?: Prisma.BookingsRepresentativenessByPeriodUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsRevenue?: Prisma.BookingsRevenueUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsRevenueByPeriod?: Prisma.BookingsRevenueByPeriodUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsTicketAverage?: Prisma.BookingsTicketAverageUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsTotalRentals?: Prisma.BookingsTotalRentalsUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsTotalRentalsByPeriod?: Prisma.BookingsTotalRentalsByPeriodUncheckedCreateNestedManyWithoutBookingsInput,
    bookingsTotalRentalsByRentalType?: Prisma.BookingsTotalRentalsByRentalTypeUncheckedCreateNestedManyWithoutBookingsInput,
  ) {
    this.companyId = companyId;
    this.id = id;
    this.BookingsRepresentativenessByChannelType = BookingsRepresentativenessByChannelType;
    this.BookingsRevenueByPayment = BookingsRevenueByPayment;
    this.BookingsTicketAverageByChannelType = BookingsTicketAverageByChannelType;
    this.BookingsTotalRentalsByChannelType = BookingsTotalRentalsByChannelType;
    this.bookingsRevenueByChannelType = bookingsRevenueByChannelType;
    this.bookingsRepresentativeness = bookingsRepresentativeness;
    this.bookingsRepresentativenessByPeriod = bookingsRepresentativenessByPeriod;
    this.bookingsRevenue = bookingsRevenue;
    this.bookingsRevenueByPeriod = bookingsRevenueByPeriod;
    this.bookingsTicketAverage = bookingsTicketAverage;
    this.bookingsTotalRentals = bookingsTotalRentals;
    this.bookingsTotalRentalsByPeriod = bookingsTotalRentalsByPeriod;
    this.bookingsTotalRentalsByRentalType = bookingsTotalRentalsByRentalType;
  }
}
