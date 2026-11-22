/**
 * The small model of the stage 4 format, a shop, as a source directory: one file for each
 * record, each written as a person or a skill would write it. Tests build a directory from it.
 */
export const EXAMPLE: Readonly<Record<string, string>> = {
  'seefore.yaml': 'format: 1\nname: Shop\n',

  'people/customer.yaml': 'name: Customer\ndescription: Buys from the shop.\n',
  'people/warehouse-clerk.yaml': 'name: Warehouse clerk\ndescription: Packs the orders that are ready to ship.\n',

  'systems/shop.yaml': 'name: Shop\ndescription: Sells goods and ships them.\nowner: shop-team\n',
  'systems/card-provider.yaml': "name: Card provider\ndescription: Takes card payments. Another company's service.\nowner: card-provider-company\n",

  'apps/storefront.yaml':
    'name: Storefront\nin: shop\nkind: browser\ndescription: Where a customer fills a basket and pays.\ntechnology: [typescript, react]\n',
  'apps/order-api.yaml': 'name: Order API\nin: shop\nkind: service\ndescription: Takes orders and says how far each has got.\ntechnology: [go]\n',
  'apps/shipping.yaml':
    'name: Shipping\nin: shop\nkind: service\ndescription: Tells the warehouse what to pack and records what was sent.\nowner: logistics-team\n',

  'stores/orders-database.yaml':
    'name: Orders database\nin: shop\nkind: database\ndescription: Every order and how far it has got.\ntechnology: [postgresql]\n',

  'components/checkout.yaml': 'name: Checkout\nin: order-api\ndescription: Takes a basket and a payment and makes an order of them.\n',
  'components/order-status.yaml': 'name: Order status\nin: order-api\ndescription: Answers how far an order has got.\n',

  'connections/customer-shops.yaml': 'from: customer\nto: storefront\nname: Fills a basket and pays\n',
  'connections/storefront-places-order.yaml':
    "from: storefront\nto: checkout\nname: Places an order\ndescription: Hands the customer's basket over as an order.\ntechnology: [https]\n",
  'connections/checkout-takes-payment.yaml': 'from: checkout\nto: card-provider\nname: Takes the payment\ntechnology: [https]\n',
  'connections/card-provider-confirms.yaml':
    'from: card-provider\nto: order-api\nname: Confirms a payment\n' +
    'description: Calls back when the payment is done. That this answers the call above is for a flow.\ntechnology: [https]\n',
  'connections/checkout-keeps-orders.yaml': 'from: checkout\nto: orders-database\nname: Writes each order\ntechnology: [sql]\n',
  'connections/order-status-reads-orders.yaml': 'from: order-status\nto: orders-database\nname: Reads how far an order has got\ntechnology: [sql]\n',
  'connections/shipping-reads-orders.yaml': 'from: shipping\nto: orders-database\nname: Reads the orders that are ready to ship\ntechnology: [sql]\n',
  'connections/clerk-packs.yaml': 'from: warehouse-clerk\nto: shipping\nname: Sees what to pack and marks it sent\n',

  'owners/shop-team.yaml': 'name: Shop team\n',
  'owners/logistics-team.yaml': 'name: Logistics team\n',
  'owners/card-provider-company.yaml': 'name: The card provider\n',

  'technologies/typescript.yaml': 'name: TypeScript\n',
  'technologies/react.yaml': 'name: React\n',
  'technologies/go.yaml': 'name: Go\n',
  'technologies/postgresql.yaml': 'name: PostgreSQL\n',
  'technologies/https.yaml': 'name: HTTPS\n',
  'technologies/sql.yaml': 'name: SQL\n',
};
