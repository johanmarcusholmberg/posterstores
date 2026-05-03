import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Branding ────────────────────────────────────────────────────────────────
// Update these values to match your brand when you're ready.

const BRAND = {
  storeName: "PostersofSpain",      // Printed at the top of the receipt
  accentColor: [40, 40, 40] as [number, number, number],   // RGB — header background
  accentText: [255, 255, 255] as [number, number, number], // RGB — header text
  // logoUrl: "/logo.png",         // Uncomment + set path to add a logo image
  // footerText: "Thank you for shopping with us!", // Custom footer message
};

// ─────────────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  posterTitleSnapshot: string;
  sizeLabelSnapshot?: string | null;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
  currency: string;
}

interface ReceiptOrder {
  id: number;
  customerEmail: string;
  shippingName: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null;
  shippingPostalCode: string;
  shippingCity: string;
  shippingRegion?: string | null;
  shippingCountry: string;
  subtotal: string | number;
  shippingCost: string | number;
  total: string | number;
  currency: string;
  createdAt?: string | null;
  items: ReceiptItem[];
  [key: string]: unknown;
}

export function generateReceipt(order: ReceiptOrder): void {
  const doc = new jsPDF();

  // Header band
  doc.setFillColor(...BRAND.accentColor);
  doc.rect(0, 0, 210, 30, "F");

  doc.setTextColor(...BRAND.accentText);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(BRAND.storeName, 14, 13);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Order Receipt", 14, 22);

  // Order meta
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(10);
  doc.text(`Order #${order.id}`, 130, 13);
  const dateStr = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString()
    : new Date().toLocaleDateString();
  doc.text(`Date: ${dateStr}`, 130, 20);
  doc.text(`Email: ${order.customerEmail}`, 130, 27);

  // Items table
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 38,
    head: [["Item", "Size", "Qty", "Unit Price", "Total"]],
    body: order.items.map((item) => [
      item.posterTitleSnapshot,
      item.sizeLabelSnapshot ?? "—",
      String(item.quantity),
      `${item.unitPrice} ${item.currency}`,
      `${item.totalPrice} ${item.currency}`,
    ]),
    headStyles: { fillColor: BRAND.accentColor },
    styles: { fontSize: 10 },
    columnStyles: {
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Totals block (right-aligned)
  const col = 130;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Subtotal:", col, finalY);
  doc.text(`${order.subtotal} ${order.currency}`, 195, finalY, { align: "right" });

  const shippingLabel =
    Number(order.shippingCost) === 0 ? "TBD" : `${order.shippingCost} ${order.currency}`;
  doc.text("Shipping:", col, finalY + 7);
  doc.text(shippingLabel, 195, finalY + 7, { align: "right" });

  doc.setDrawColor(200, 200, 200);
  doc.line(col, finalY + 10, 195, finalY + 10);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Total:", col, finalY + 18);
  doc.text(`${order.total} ${order.currency}`, 195, finalY + 18, { align: "right" });

  // Shipping address (left side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text("Shipping To:", 14, finalY + 8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  const addrLines = [
    order.shippingName,
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    `${order.shippingPostalCode} ${order.shippingCity}${order.shippingRegion ? ", " + order.shippingRegion : ""}`,
    order.shippingCountry,
  ].filter(Boolean) as string[];

  addrLines.forEach((line, i) => {
    doc.text(line, 14, finalY + 16 + i * 6);
  });

  // Optional footer
  // const footerY = 280;
  // doc.setFontSize(9);
  // doc.setTextColor(150, 150, 150);
  // doc.text(BRAND.footerText ?? "", 105, footerY, { align: "center" });

  doc.save(`receipt-order-${order.id}.pdf`);
}
