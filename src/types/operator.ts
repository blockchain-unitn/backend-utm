import { ApiProperty } from '@nestjs/swagger';
import { CountryCode, TaxIdType } from './enums';

export class TaxId {
  @ApiProperty({ enum: TaxIdType })
  type: TaxIdType;
  @ApiProperty()
  value: string;
}

/**
 * Represents an operator entity in the system.
 *
 * An operator is typically a business or individual that manages aircraft operations (like drones),
 * containing essential contact and identification information. For example, Amazon Prime Air.
 *
 * @interface Operator
 */
export interface Operator {
  _id: string;
  name: string;
  contact_email: string;
  phone?: string;
  address?: string;

  country?: CountryCode;
  tax_ids?: TaxId[];
}

export class OperatorInput {
  @ApiProperty()
  name: string;
  @ApiProperty()
  contact_email: string;
  @ApiProperty({ required: false })
  phone?: string;
  @ApiProperty({ required: false })
  address?: string;
  @ApiProperty({ enum: CountryCode, required: false })
  country?: CountryCode;
  @ApiProperty({ type: [TaxId], required: false })
  tax_ids?: TaxId[];
}
