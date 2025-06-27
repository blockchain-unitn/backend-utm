import { CountryCode, TaxIdType } from  './enums';

export interface TaxId {
  type: TaxIdType;
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

export interface OperatorInput {
  name: string;
  contact_email: string;
  phone?: string;
  address?: string;

  country?: CountryCode;
  tax_ids?: TaxId[];
}