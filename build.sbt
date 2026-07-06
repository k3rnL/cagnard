ThisBuild / organization := "io.cagnard"
ThisBuild / scalaVersion := "3.3.3"
ThisBuild / version := "0.3.0"

lazy val awsSdkVersion = "2.46.21"

lazy val root = (project in file("."))
  .aggregate(backend)
  .settings(
    name := "cagnard",
    publish / skip := true
  )

lazy val backend = (project in file("backend"))
  .settings(
    name := "cagnard-backend",
    libraryDependencies ++= Seq(
      "com.softwaremill.sttp.tapir" %% "tapir-core" % "1.11.13",
      "com.softwaremill.sttp.tapir" %% "tapir-http4s-server" % "1.11.13",
      "com.softwaremill.sttp.tapir" %% "tapir-json-circe" % "1.11.13",
      "org.http4s" %% "http4s-ember-server" % "0.23.30",
      "org.http4s" %% "http4s-dsl" % "0.23.30",
      "org.http4s" %% "http4s-circe" % "0.23.30",
      "io.circe" %% "circe-core" % "0.14.10",
      "io.circe" %% "circe-generic" % "0.14.10",
      "io.circe" %% "circe-parser" % "0.14.10",
      "com.typesafe" % "config" % "1.4.3",
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "software.amazon.awssdk" % "s3" % awsSdkVersion,
      "software.amazon.awssdk" % "apache-client" % awsSdkVersion,
      "org.scalameta" %% "munit" % "1.0.4" % Test,
      "org.typelevel" %% "munit-cats-effect" % "2.0.0" % Test
    ),
    Compile / run / fork := true,
    Test / fork := true
  )
