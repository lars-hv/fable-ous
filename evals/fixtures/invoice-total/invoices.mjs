export function totalPaid(invoices) {
  return invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
}
