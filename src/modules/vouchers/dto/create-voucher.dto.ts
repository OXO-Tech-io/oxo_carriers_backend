import { IsOptional, IsString } from 'class-validator';

// Kept loose (strings straight off the multipart body, like the original
// controller's `req.body.x`): the original enforces "Vendor and Amount are
// required" / "Invalid amount" itself with specific messages, so those exact
// messages are reproduced in VouchersService instead of generic
// class-validator error text.
export class CreateVoucherDto {
  @IsOptional()
  @IsString()
  service_provider_id?: string;

  @IsOptional()
  @IsString()
  vendor_id?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  vat?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
