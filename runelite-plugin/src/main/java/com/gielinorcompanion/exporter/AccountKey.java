package com.gielinorcompanion.exporter;

import lombok.Value;

/** Identifies one exported account: the same character in a different game mode (e.g. Leagues) is a separate account. */
@Value
class AccountKey
{
	long hash;
	/** RuneScapeProfileType name in lower case, e.g. {@code standard}, {@code seasonal}. */
	String profileType;
	String rsn;

	String key()
	{
		return hash + "-" + profileType;
	}
}
