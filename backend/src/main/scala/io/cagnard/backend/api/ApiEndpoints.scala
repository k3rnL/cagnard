package io.cagnard.backend.api

import sttp.tapir.*

object ApiEndpoints:
  private val api = "api"

  val health: PublicEndpoint[Unit, Unit, String, Any] =
    endpoint.get.in(api / "health").out(stringBody)

  val all: List[AnyEndpoint] = List(health)
