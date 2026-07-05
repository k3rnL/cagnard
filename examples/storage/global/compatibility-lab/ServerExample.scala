package examples.compatibility

final case class StorageObject(
    name: String,
    mimeType: Option[String],
    sizeBytes: Long
)

object ServerExample:
  def displayName(value: StorageObject): String =
    value.mimeType match
      case Some(mimeType) => s"${value.name} ($mimeType)"
      case None => value.name
