exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { shop, token, orderId, updates } = JSON.parse(event.body);

    const orderUpdate = {};

    if (updates.shipping_address) {
      orderUpdate.shipping_address = updates.shipping_address;
    }

    if (updates.discount) {
      orderUpdate.discount_codes = [{
        code: "AGENT_DISCOUNT",
        amount: String(updates.discount),
        type: "fixed_amount"
      }];
    }

    const response = await fetch(
      `https://${shop}/admin/api/2024-01/orders/${orderId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order: orderUpdate }),
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};