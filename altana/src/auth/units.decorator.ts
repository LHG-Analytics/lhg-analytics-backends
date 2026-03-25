import { SetMetadata } from '@nestjs/common';

export const UNITS_KEY = 'units';
export const Units = (...units: string[]) => SetMetadata(UNITS_KEY, units);
