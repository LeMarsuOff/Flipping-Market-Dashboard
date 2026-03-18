import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

export default async function handler(req, res) {
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID
    });

    const trades = response.results.map(page => {
      const p = page.properties;

      return {
        date: p["Date"]?.date?.start,
        pair: p["Pair"]?.title?.[0]?.plain_text,
        resultR: p["ResultR"]?.number
      };
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(trades);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
