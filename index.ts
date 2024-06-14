import { Command } from "commander";
const program = new Command();

const POLLING_DURATION = 1000;

program
  .name("facebook app takehome")
  .description("CLI to get a list of user data")
  .version("1.0.0");

program
  .command("fb-app")
  .description("An app to grab a facebook user's data")
  .argument("<access_token>", "user's access token")
  .action(async (access_token: string, options: unknown) => {
    console.log("starting process...");
    //   poll user data
    fetchAndPoll(access_token).catch(console.log);
  });

program.parse();

// This function should throw if headers are bad
async function fetchAndPoll(access_token: string) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/me?fields=id%2Cname%2Clast_name&access_token=${access_token}`,
    {
      method: "GET",
    },
  );
  const usage_header_unparsed = res.headers.get("X-App-Usage");
  if (usage_header_unparsed === null) {
    throw "Expected header not returned - log with mid severity";
  }
  const usage_header = JSON.parse(usage_header_unparsed);

  const data: unknown = await res.json();
  throwIfDataHasError(data);

  const pollingTime = throttleIfGettingCloseToUsage(usage_header);

  console.log(data);
  setTimeout(() => {
    console.log("polling...");
    fetchAndPoll(access_token).catch(console.log);
  }, pollingTime);
}

// FB api returns error as data response so check is manually done: https://developers.facebook.com/docs/graph-api/guides/error-handling
// TODO this would be more readable using zod
function throwIfDataHasError(data: unknown) {
  if (
    !!data &&
    typeof data === "object" &&
    "error" in data &&
    !!data.error &&
    typeof data.error === "object"
  ) {
    if ("code" in data.error && data.error.code === 4) {
      // Would add a Sentry/Datadog log here with info severity
      console.error(
        "sorry rate limit has been reached please try again in an hour",
      );
      throw data.error;
    }
    // Auth and permissions catch all
    throw data.error;
  }
}

// {"call_count":4,"total_cputime":0,"total_time":4}
type IUsageHeader = {
  call_count: number;
  total_cputime: number;
  total_time: number;
};

// checking that the fetched header adheres to the following doc to avoid runtime surprises,
// realistically I would use zod
function checkHeaderInterface(usage_header: unknown): IUsageHeader | undefined {
  if (
    !!usage_header &&
    typeof usage_header === "object" &&
    "call_count" in usage_header &&
    typeof usage_header.call_count === "number" &&
    "total_cputime" in usage_header &&
    typeof usage_header.total_cputime === "number" &&
    "total_time" in usage_header &&
    typeof usage_header.total_time === "number"
  ) {
    // This type casting isn't great but a bug in typescript requires it
    return usage_header as IUsageHeader;
  }

  return undefined;
}

function throttleIfGettingCloseToUsage(usage_header: unknown): number {
  //   error
  const usageHeader = checkHeaderInterface(usage_header);
  if (usageHeader === undefined) {
    console.error("header does not subscribe to the expected format");
    throw usage_header;
  }
  console.log("usage percentage: " + usageHeader.call_count + "%");

  //   if usage is close to 80% start throttling
  if (usageHeader.call_count > 90) {
    console.log(
      "you've hit 90% of your usage limit you are now being throttled to 1 req every 10 seconds",
    );
    return 10000;
  }
  if (usageHeader.call_count > 80) {
    console.log(
      "you've hit 90% of your usage limit you are now being throttled to 1 req every 5 seconds",
    );
    return 5000;
  }

  return 2000;
}
