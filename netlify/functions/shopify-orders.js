exports.handler = async (event) => {
  const { shop, token } = event.queryStringParameters;

  if (!shop || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "shop aur token required hain" }),
    };
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?limit=250&status=any`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
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