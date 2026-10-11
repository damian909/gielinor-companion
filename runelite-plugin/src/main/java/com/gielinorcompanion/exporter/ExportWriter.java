package com.gielinorcompanion.exporter;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.stream.Collectors;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.client.util.Filepath;

/**
 * Writes export files under the plugin data directory ({@code .runelite/plugin-data/gielinorcompanion/}):
 * <pre>
 *   index.json                                  known accounts
 *   accounts/&lt;key&gt;/&lt;category&gt;.json             one envelope per {@link Category}
 *   accounts/&lt;key&gt;/containers/&lt;name&gt;.json      one envelope per {@link TrackedContainer}
 * </pre>
 * where {@code key} is {@code <accountHash>-<profileType>}. All disk IO runs on a single
 * background thread, in submission order, never on the client thread.
 */
@Slf4j
@Singleton
class ExportWriter
{
	static final int SCHEMA_VERSION = 1;
	private static final String INDEX_FILE = "index.json";
	private static final String COLLECTION_LOG_FILE = "collection_log.json";

	@Inject
	private Gson gson;

	private ExecutorService executor;
	private Filepath root;
	private JsonObject index;

	void start(Filepath root)
	{
		this.root = root;
		this.executor = Executors.newSingleThreadExecutor(r ->
		{
			Thread t = new Thread(r, "gielinor-companion-exporter");
			t.setDaemon(true);
			return t;
		});
		submit(this::init);
	}

	/** Lets already-queued writes (such as the logout status) finish, without blocking. */
	void stop()
	{
		if (executor != null)
		{
			executor.shutdown();
			executor = null;
		}
	}

	void writeCategory(AccountKey account, String fileName, Map<String, Object> data)
	{
		Map<String, Object> envelope = envelope(account, fileName, data);
		submit(() -> writeJson(accountDir(account), fileName + ".json", envelope));
	}

	void writeContainer(AccountKey account, String fileName, Map<String, Object> data)
	{
		Map<String, Object> envelope = envelope(account, "container", data);
		submit(() -> writeJson(accountDir(account).joinSegment("containers"), fileName + ".json", envelope));
	}

	/**
	 * Merges newly seen collection log counts into {@code collection_log.json}. Viewing one page only
	 * reveals that page, so counts accumulate across sessions; a capture that covers every obtained
	 * item (the log's search) replaces the stored set instead.
	 *
	 * @param structure tabs/pages/items, or null to keep the stored layout
	 */
	void mergeCollectionLog(AccountKey account, Map<Integer, Integer> seen, boolean complete,
		int obtainedCount, int totalSlots, List<Map<String, Object>> structure)
	{
		String now = Instant.now().toString();
		submit(() ->
		{
			Filepath dir = accountDir(account);
			JsonObject previous = readJsonObject(dir.joinSegment(COLLECTION_LOG_FILE));
			JsonObject prevData = previous != null && previous.has("data") ? previous.getAsJsonObject("data") : new JsonObject();

			Map<String, Integer> obtained = new TreeMap<>();
			if (!complete && prevData.has("obtained"))
			{
				for (Map.Entry<String, JsonElement> e : prevData.getAsJsonObject("obtained").entrySet())
				{
					obtained.put(e.getKey(), e.getValue().getAsInt());
				}
			}
			for (Map.Entry<Integer, Integer> e : seen.entrySet())
			{
				obtained.put(String.valueOf(e.getKey()), e.getValue());
			}

			Map<String, Object> data = new LinkedHashMap<>();
			data.put("obtainedCount", obtainedCount > 0 ? obtainedCount : intOr(prevData, "obtainedCount", 0));
			data.put("totalSlots", totalSlots > 0 ? totalSlots : intOr(prevData, "totalSlots", 0));
			data.put("knownObtained", obtained.size());
			data.put("lastCompleteCaptureAt", complete ? now : stringOr(prevData, "lastCompleteCaptureAt"));
			data.put("updatedAt", now);
			data.put("obtained", obtained);
			data.put("tabs", structure != null ? structure : prevData.get("tabs"));
			writeJson(dir, COLLECTION_LOG_FILE, envelope(account, "collection_log", data));
		});
	}

	private JsonObject readJsonObject(Filepath file)
	{
		if (!file.exists())
		{
			return null;
		}
		try (Reader reader = file.openReader())
		{
			return gson.fromJson(reader, JsonObject.class);
		}
		catch (IOException | RuntimeException e)
		{
			log.warn("Ignoring unreadable {}", file, e);
			return null;
		}
	}

	private static int intOr(JsonObject o, String key, int fallback)
	{
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsInt() : fallback;
	}

	private static String stringOr(JsonObject o, String key)
	{
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
	}

	void updateIndex(AccountKey account, Map<String, Object> accountData)
	{
		String capturedAt = Instant.now().toString();
		submit(() ->
		{
			JsonArray accounts = index.getAsJsonArray("accounts");
			JsonObject entry = null;
			for (JsonElement e : accounts)
			{
				JsonObject o = e.getAsJsonObject();
				if (account.key().equals(o.has("key") ? o.get("key").getAsString() : null))
				{
					entry = o;
					break;
				}
			}
			if (entry == null)
			{
				entry = new JsonObject();
				accounts.add(entry);
			}
			entry.addProperty("key", account.key());
			entry.addProperty("accountHash", Long.toString(account.getHash()));
			entry.addProperty("profileType", account.getProfileType());
			entry.addProperty("rsn", account.getRsn());
			entry.addProperty("accountType", String.valueOf(accountData.get("accountTypeName")));
			entry.addProperty("lastSeen", capturedAt);
			writeJson(root, INDEX_FILE, index);
		});
	}

	private Map<String, Object> envelope(AccountKey account, String category, Map<String, Object> data)
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("schemaVersion", SCHEMA_VERSION);
		m.put("pluginVersion", CompanionExporterPlugin.VERSION);
		m.put("category", category);
		m.put("accountHash", Long.toString(account.getHash()));
		m.put("profileType", account.getProfileType());
		m.put("rsn", account.getRsn());
		m.put("capturedAt", Instant.now().toString());
		m.put("data", data);
		return m;
	}

	private Filepath accountDir(AccountKey account)
	{
		return root.joinSegment("accounts").joinSegment(account.key());
	}

	private void init()
	{
		try
		{
			root.createDirectories();
			deleteStrayTempFiles();
		}
		catch (IOException e)
		{
			log.warn("Could not prepare export directory {}", root, e);
		}

		index = null;
		Filepath file = root.joinSegment(INDEX_FILE);
		if (file.exists())
		{
			try (Reader reader = file.openReader())
			{
				index = gson.fromJson(reader, JsonObject.class);
			}
			catch (IOException | RuntimeException e)
			{
				log.warn("Ignoring unreadable {}", file, e);
			}
		}
		if (index == null || !index.has("accounts") || !index.get("accounts").isJsonArray())
		{
			index = new JsonObject();
			index.add("accounts", new JsonArray());
		}
		index.addProperty("schemaVersion", SCHEMA_VERSION);
	}

	private void deleteStrayTempFiles() throws IOException
	{
		for (Filepath f : root.walk().filter(f -> f.getFileName().endsWith(".tmp")).collect(Collectors.toList()))
		{
			f.deleteIfExists();
		}
	}

	private void writeJson(Filepath dir, String fileName, Object content)
	{
		String json = gson.toJson(content);
		try
		{
			dir.createDirectories();
			Filepath target = dir.joinSegment(fileName);
			Filepath tmp = dir.createTempFile(fileName + "-", ".tmp");
			try
			{
				tmp.write(json);
				tmp.moveTo(target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			}
			catch (IOException e)
			{
				// Windows refuses to replace a file another process (the MCP server) has open
				// at this instant; fall back to a plain overwrite. Readers retry on a bad parse.
				tmp.deleteIfExists();
				target.write(json);
			}
		}
		catch (IOException e)
		{
			log.warn("Failed to write {}/{}", dir, fileName, e);
		}
	}

	private void submit(Runnable task)
	{
		ExecutorService ex = executor;
		if (ex == null)
		{
			return;
		}
		try
		{
			ex.execute(task);
		}
		catch (RejectedExecutionException e)
		{
			log.debug("Export writer stopped; dropping write");
		}
	}
}
